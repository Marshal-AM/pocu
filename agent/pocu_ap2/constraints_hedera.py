from __future__ import annotations

import time
from typing import Any

from ap2.sdk.constraints import MandateContext
from ap2.sdk.generated.open_payment_mandate import (
    AgentRecurrence,
    AmountRange,
    Budget,
)
from ap2.sdk.generated.payment_mandate import PaymentMandate

from pocu_ap2.config import hbar_to_tinybars


HEDERA_INSTRUMENT_TYPE = "hedera_hbar_allowance"
HEDERA_AMOUNT_CURRENCY = "USD"  # AP2 ISO field; amounts are tinybars for Hedera rail


class HederaBudgetEvaluator:
    """Budget in HBAR major units; payment amounts in tinybars."""

    def __init__(self, constraint: Budget, mandate_context: MandateContext | None):
        self.constraint = constraint
        self.mandate_context = mandate_context

    def evaluate(
        self,
        closed_mandate: PaymentMandate,
        open_checkout_hash: str | None = None,
    ) -> list[str]:
        if self.mandate_context is None:
            return ["Missing mandate context required to evaluate Hedera budget"]
        max_tinybars = hbar_to_tinybars(float(self.constraint.max))
        past = self.mandate_context.total_amount
        next_total = past + closed_mandate.payment_amount.amount
        if next_total > max_tinybars:
            return [
                f"Cumulative spend {next_total} tinybars exceeds budget "
                f"{max_tinybars} ({self.constraint.max} HBAR)"
            ]
        return []


class HederaAmountRangeEvaluator:
    """Amount range with max/min in tinybars."""

    def __init__(self, constraint: AmountRange):
        self.constraint = constraint

    def evaluate(
        self,
        closed_mandate: PaymentMandate,
        open_checkout_hash: str | None = None,
    ) -> list[str]:
        amount = closed_mandate.payment_amount.amount
        if self.constraint.min is not None and amount < self.constraint.min:
            return [f"Amount {amount} below minimum {self.constraint.min} tinybars"]
        if self.constraint.max is not None and amount > self.constraint.max:
            return [f"Amount {amount} exceeds maximum {self.constraint.max} tinybars"]
        return []


def check_hedera_payment_constraints(
    open_mandate: Any,
    closed_payment: PaymentMandate,
    open_checkout_hash: str | None,
    mandate_context: MandateContext | None,
) -> list[str]:
    """Run AP2 constraint checks with Hedera-specific budget/amount evaluators."""
    from ap2.sdk.constraints import (
        AllowedPayees,
        AllowedPaymentInstruments,
        AllowedPisps,
        AgentRecurrence,
        ExecutionDate,
        PaymentReference,
        check_preset_payment_claims,
        create_payment_evaluator,
    )

    violations: list[str] = []
    violations.extend(check_preset_payment_claims(open_mandate, closed_payment))

    has_recurrence = any(isinstance(c, AgentRecurrence) for c in open_mandate.constraints)
    if has_recurrence:
        if not any(isinstance(c, AmountRange) for c in open_mandate.constraints):
            violations.append(
                "payment.agent_recurrence requires payment.amount_range constraint"
            )
        if not any(isinstance(c, Budget) for c in open_mandate.constraints):
            violations.append("payment.agent_recurrence requires payment.budget constraint")

    for constraint in open_mandate.constraints:
        if isinstance(constraint, Budget):
            violations.extend(
                HederaBudgetEvaluator(constraint, mandate_context).evaluate(
                    closed_payment, open_checkout_hash
                )
            )
        elif isinstance(constraint, AmountRange):
            violations.extend(
                HederaAmountRangeEvaluator(constraint).evaluate(
                    closed_payment, open_checkout_hash
                )
            )
        else:
            evaluator = create_payment_evaluator(constraint, mandate_context)
            violations.extend(evaluator.evaluate(closed_payment, open_checkout_hash))

    instrument = closed_payment.payment_instrument
    if instrument and instrument.type != HEDERA_INSTRUMENT_TYPE:
        violations.append(
            f"Expected payment instrument type {HEDERA_INSTRUMENT_TYPE}, "
            f"got {instrument.type}"
        )
    return violations


def mandate_context_from_session(row: dict[str, Any]) -> MandateContext:
    return MandateContext(
        total_amount=int(row.get("total_spent_tinybars") or 0),
        total_uses=int(row.get("total_uses") or 0),
        last_used_date=time.time() if row.get("total_uses") else None,
    )
