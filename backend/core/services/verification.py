"""Which documents prove which checks, and how document reviews roll up into a user's
verification status. Uses the existing verification_docs table, so no database change is needed."""

DOC_LABELS = {
    "national_id": "National ID", "passport": "Passport", "proof_of_ownership": "Proof of ownership",
    "authority_to_let": "Letter of authority to let", "proof_of_address": "Proof of address",
    "employer_letter": "Employer letter", "payslip": "Payslip", "other": "Other document",
}

_IDENTITY = {"key": "identity", "title": "Identity", "badge": "ID verified", "required": True,
             "types": ["national_id", "passport"],
             "hint": "A clear photo or scan of your national ID or passport. The name must match your account."}
_ADDRESS = {"key": "address", "title": "Proof of address", "badge": "Address verified", "required": False,
            "types": ["proof_of_address"], "hint": "A recent utility bill, rates bill or bank statement showing your name and address."}

CHECKS = {
    "landlord": [
        _IDENTITY,
        {"key": "ownership", "title": "Ownership or authority to let", "badge": "Ownership verified", "required": True,
         "types": ["proof_of_ownership", "authority_to_let"],
         "hint": "Title deed, rates bill or lease in your name. If you look after the home for the owner, "
                 "upload a signed letter of authority from the owner."},
        _ADDRESS,
    ],
    "tenant": [
        _IDENTITY,
        {"key": "employment", "title": "Employment or income", "badge": "Income checked", "required": False,
         "types": ["employer_letter", "payslip"],
         "hint": "An employer letter or a recent payslip. Landlords look for this when choosing a tenant."},
        _ADDRESS,
    ],
}

ALLOWED_TYPES = {role: [t for c in checks for t in c["types"]] for role, checks in CHECKS.items()}


def summarize(user, docs=None):
    """One entry per check, with status: approved | pending | rejected | missing."""
    docs = list(docs) if docs is not None else list(user.verification_docs.all())
    out = []
    for c in CHECKS.get(user.role, []):
        statuses = {d.status for d in docs if d.doc_type in c["types"]}
        status = ("approved" if "approved" in statuses else "pending" if "pending" in statuses
                  else "rejected" if "rejected" in statuses else "missing")
        out.append({**c, "status": status, "doc_types": [{"value": t, "label": DOC_LABELS[t]} for t in c["types"]]})
    return out


def is_complete(checks):
    return all(c["status"] == "approved" for c in checks if c["required"])


def badges(user, docs=None):
    """Specific, public-safe labels such as 'ID verified'. Never exposes the documents themselves."""
    return [c["badge"] for c in summarize(user, docs) if c["status"] == "approved"]


def recompute_status(user):
    """Roll document decisions up into users.verification_status. A verified account is never
    downgraded automatically; an admin must do that explicitly."""
    docs = list(user.verification_docs.all())
    if is_complete(summarize(user, docs)):
        new = "verified"
    elif any(d.status == "pending" for d in docs):
        new = "pending"
    elif any(d.status == "rejected" for d in docs):
        new = "rejected"
    else:
        new = "unverified"
    if user.verification_status == "verified" and new != "verified":
        return user.verification_status
    if new != user.verification_status:
        user.verification_status = new
        user.save(update_fields=["verification_status"])
    return new
