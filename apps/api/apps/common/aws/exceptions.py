class StorageError(Exception):
    """An S3 storage operation failed."""

    def __init__(self, operation: str, key: str, cause: Exception):
        self.operation = operation
        self.key = key
        super().__init__(f'S3 {operation} failed for {key!r}: {cause}')
