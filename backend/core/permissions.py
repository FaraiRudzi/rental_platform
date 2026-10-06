from rest_framework.permissions import BasePermission


def role_required(*roles):
    class _Role(BasePermission):
        message = "You do not have access to this resource."

        def has_permission(self, request, view):
            u = request.user
            return bool(u and u.is_authenticated and u.is_active and u.role in roles)

    _Role.__name__ = "Role_" + "_".join(roles)
    return _Role


IsTenant = role_required("tenant")
IsLandlord = role_required("landlord")
IsAdmin = role_required("admin")
IsTenantOrLandlord = role_required("tenant", "landlord")
