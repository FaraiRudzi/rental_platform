"""Phone number helper. (Login by SMS code was removed: accounts use a password.)"""
import re

from core.exceptions import WorkflowError


def normalize_phone(raw: str) -> str:
    phone = re.sub(r"[\s\-()]", "", raw or "")
    if not re.fullmatch(r"\+\d{8,15}", phone):
        raise WorkflowError("Enter your phone number in international format, e.g. +263771234567.")
    return phone
