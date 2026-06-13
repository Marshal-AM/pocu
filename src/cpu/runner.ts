import { Contract, Signer, keccak256, solidityPacked } from "ethers";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { DeploymentAddresses } from "../types";
import { compileMlpProgram, jobIdFromData, jobIdFromRunId } from "./compiler";
import { DEFAULT_FRAUD_MLP, MlpModelSpec } from "./models/mlp-spec";
import { dispatchProgram, registerCpuJob, DispatcherContext } from "./dispatcher";
import { TabularSample } from "../types";
import { StepLogger } from "../logger";
import { computeMatrixSnapshot } from "../snapshot";
import { harvestTxHashes } from "../mirror";
import { TX_GAS_LIMIT } from "../config";
import { sendAndWaitContract } from "../tx-utils";
import {
  cidFromIpfsUri,
  pinManifestJson,
  shouldPinManifest,
} from "../ipfs/pinata";
import { createHcsTopic } from "../hcs";
import { settleBatchViaAgent } from "../protocols/ap2-settle";

export interface TrainResult {
  jobId: string;
  programHash: string;
  eventLogHash: string;
  txHashes: string[];
  manifestPath: string;
  hcsTopicId: string;
}

export async function runCpuTraining(params: {
  deployment: DeploymentAddresses;
  signer: Signer;
  topicId?: string;
  samples: TabularSample[];
  dataHash: string;
  spec?: MlpModelSpec;
  log?: StepLogger;
}): Promise<TrainResult> {
  const spec = params.spec ?? DEFAULT_FRAUD_MLP;
  const runId = process.env.JOB_ID?.trim();
  const jobId = runId
    ? jobIdFromRunId(runId, params.dataHash)
    : jobIdFromData(params.dataHash);
  const topicId = params.topicId ?? (await createHcsTopic(params.log));
  params.log?.info(`Run jobId=${jobId.slice(0, 18)}… | HCS topic=${topicId}`);

  const program = compileMlpProgram(spec, params.samples, jobId, params.dataHash);

  const ap2SessionId = process.env.AP2_SESSION_ID?.trim();
  if (ap2SessionId) {
    params.log?.info(`[ap2] batch settlement via session=${ap2SessionId.slice(0, 8)}…`);
  }

  const ctx: DispatcherContext = {
    deployment: params.deployment,
    signer: params.signer,
    topicId,
    log: params.log,
    ap2SessionId,
    jobId: runId ?? jobId,
  };

  params.log?.info(`Program: ${program.instructions.length} instructions, ${spec.epochs} epochs`);

  const registerReceipt = await registerCpuJob(ctx, program);
  if (ap2SessionId) {
    await settleBatchViaAgent({
      sessionId: ap2SessionId,
      batchIndex: -1,
      receipt: registerReceipt,
      jobId: runId ?? jobId,
      log: params.log,
    });
  }
  const result = await dispatchProgram(ctx, program);

  const harvested = await harvestTxHashes(64);
  const txMatrixSnapshot = computeMatrixSnapshot(harvested.map((t) => t.hash));

  const weightFlat: bigint[] = [];
  for (const wId of program.weightTensorIds) {
    const t = result.store.get(program.jobId, wId);
    if (!t) throw new Error(`Missing weight tensor at commit: ${wId}`);
    weightFlat.push(...t.data);
  }

  const weightsHash = keccak256(solidityPacked(["int256[]"], [weightFlat]));

  const registryAbi = [
    "function commitCpuModel(bytes32 jobId, bytes32 dataHash, bytes32 txMatrixSnapshot, bytes32 programHash, bytes32 eventLogHash, bytes32 weightsHash, string hcsTopicId, string architecture, uint256 sampleCount, uint256 epochCount, address jobRegistry)",
  ];
  const registry = new Contract(
    params.deployment.modelRegistry,
    registryAbi,
    params.signer
  );
  const commitReceipt = await sendAndWaitContract(
    registry,
    "commitCpuModel",
    [
      jobId,
      `0x${params.dataHash}`,
      txMatrixSnapshot,
      result.programHash,
      result.eventLogHash,
      weightsHash,
      topicId,
      program.architecture,
      params.samples.length,
      spec.epochs,
      params.deployment.cpuJobRegistry,
    ],
    { gasLimit: TX_GAS_LIMIT, log: params.log, txLabel: "commitCpuModel" }
  );
  result.txHashes.push(commitReceipt.hash);
  if (ap2SessionId) {
    await settleBatchViaAgent({
      sessionId: ap2SessionId,
      batchIndex: -2,
      receipt: commitReceipt,
      jobId: runId ?? jobId,
      log: params.log,
    });
  }

  await publishHcsCommit(topicId, jobId, result.eventLogHash, params.log);

  const manifest: Record<string, unknown> = {
    jobId,
    runId: runId ?? null,
    dataHash: params.dataHash,
    programHash: result.programHash,
    eventLogHash: result.eventLogHash,
    weightsHash,
    finalWeights: weightFlat.map((w) => w.toString()),
    architecture: program.architecture,
    samplesTrained: params.samples.length,
    epochs: spec.epochs,
    trainingTxIds: result.txHashes,
    hcsTopicId: topicId,
    txMatrixSnapshot,
    deployment: params.deployment,
    trainingMode: "onchain-cpu",
    ap2SessionId: ap2SessionId ?? null,
  };

  if (shouldPinManifest()) {
    const ipfsUri = await pinManifestJson(manifest);
    manifest.ipfsUri = ipfsUri;
    params.log?.logIpfsPin(cidFromIpfsUri(ipfsUri), jobId, [weightFlat.length]);
    params.log?.info(`Model manifest pinned (final weights + metadata)`);
  }

  const manifestPath =
    process.env.MANIFEST_PATH ?? "output/cpu_model_manifest.json";
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    jobId,
    programHash: result.programHash,
    eventLogHash: result.eventLogHash,
    txHashes: result.txHashes,
    manifestPath,
    hcsTopicId: topicId,
  };
}

async function publishHcsCommit(
  topicId: string,
  jobId: string,
  eventLogHash: string,
  log?: StepLogger
): Promise<void> {
  if (!topicId) {
    throw new Error("HCS topic id required for COMMIT_WEIGHTS — run npm run deploy");
  }
  const { publishHcsMessage } = await import("../hcs");
  await publishHcsMessage(
    topicId,
    "COMMIT_WEIGHTS",
    { job_id: jobId, event_log_hash: eventLogHash },
    log
  );
}

export function loadDeployment(): DeploymentAddresses {
  const path = "deployments/testnet.json";
  if (!existsSync(path)) throw new Error("Run: npm run deploy");
  return JSON.parse(readFileSync(path, "utf-8"));
}
