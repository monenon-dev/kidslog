import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="kidslog-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["LOCAL_STORAGE_DIR"] = f"{_tmp}/storage"
os.environ["LOCAL_STORAGE_URL_PREFIX"] = ""
os.environ["AI_PROVIDER"] = "mock"
