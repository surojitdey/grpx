from functools import lru_cache
from typing import Protocol


class StorageService(Protocol):
    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def get_object_metadata(self, key: str) -> tuple[int, str] | None: ...

    def download(self, key: str) -> bytes: ...

    def put_thumbnail(self, key: str, content: bytes) -> None: ...

    def generate_presigned_upload_url(
        self, key: str, content_type: str
    ) -> str: ...

    def generate_presigned_download_url(
        self, key: str, expires_in: int = 3600
    ) -> str: ...


@lru_cache(maxsize=1)
def get_storage_service() -> StorageService:
    from .s3 import S3StorageService

    return S3StorageService()
