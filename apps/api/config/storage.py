"""S3 storage with separate container and browser endpoints for LocalStack."""

from django.conf import settings
from django.utils.functional import cached_property
from storages.backends.s3 import S3Storage


class LocalStackAwareS3Storage(S3Storage):
    @cached_property
    def browser_storage(self):
        # Sign against the browser endpoint directly: replacing the hostname
        # after signing would invalidate the SigV4 signature.
        options = {key: getattr(self, key) for key in self.get_default_settings()}
        options['endpoint_url'] = settings.AWS_S3_EXTERNAL_ENDPOINT_URL
        options['custom_domain'] = None
        return S3Storage(**options)

    def url(self, name, parameters=None, expire=None, http_method=None):
        if settings.AWS_S3_EXTERNAL_ENDPOINT_URL:
            return self.browser_storage.url(name, parameters, expire, http_method)
        return super().url(name, parameters, expire, http_method)
