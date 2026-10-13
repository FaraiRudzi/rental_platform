from rest_framework.response import Response
from rest_framework.views import exception_handler


class WorkflowError(Exception):
    """A business-rule violation. Returned to the client as HTTP 400."""


def api_exception_handler(exc, context):
    if isinstance(exc, WorkflowError):
        return Response({"detail": str(exc)}, status=400)
    return exception_handler(exc, context)
