from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    # Development only. Only listing photos and site branding (listings/, site/) are public; private/ (ID documents) is NOT exposed.
    # In production let nginx serve /media/listings/ and nothing else under media.
    urlpatterns += [re_path(r"^media/(?P<path>(?:listings|site)/.*)$", serve, {"document_root": settings.MEDIA_ROOT})]
