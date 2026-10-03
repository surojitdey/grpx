from functools import lru_cache
from typing import BinaryIO, Protocol


class StorageService(Protocol):
    def upload(
        self, key: str, content: BinaryIO | bytes, content_type: str
    ) -> None: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

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
