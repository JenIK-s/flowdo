import os, tempfile
os.environ["FLOWDO_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)


def test_full_flow():
    pid = c.post("/api/projects", json={"name": "Работа"}).json()["id"]
    assert c.post("/api/projects", json={"name": "Работа"}).status_code == 409
    t = c.post("/api/tasks", json={"title": "Отчёт", "priority": 3, "project_id": pid,
                                   "subtasks": [{"t": "черновик", "d": True}, {"t": "правки"}]}).json()
    assert t["project_id"] == pid and len(t["subtasks"]) == 2
    assert c.patch(f"/api/tasks/{t['id']}", json={"done": True}).json()["done"]
    s = c.get("/api/stats").json()
    assert s["total"] == 1 and s["done"] == 1 and s["week"][-1]["n"] == 1
    assert "Отчёт" in c.get("/api/export.csv").content.decode("utf-8-sig")
    dump = c.get("/api/export.json").json()
    assert c.post("/api/import", json=dump).json()["tasks"] == 1
    c.delete(f"/api/projects/{pid}")
    assert all(x["project_id"] is None for x in c.get("/api/tasks").json())
    acts = [a["action"] for a in c.get("/api/activity").json()]
    assert "created" in acts and "completed" in acts and "imported" in acts
