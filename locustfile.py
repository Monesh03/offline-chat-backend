# locustfile.py
from locust import HttpUser, task, between
import random
import datetime
import socket
import requests

# ✅ Node backend API where we log
BACKEND_LOG_URL = "http://192.168.169.248:8000/api/log-performance"

# ✅ Get machine's LAN IP
def get_machine_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

MACHINE_IP = get_machine_ip()

def trace_headers(user_ip=None):
    ip = user_ip or MACHINE_IP
    return {
        "X-Trace-IP": ip,
        "X-Trace-Timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "User-Agent": "LocustLoadTester/1.0"
    }

# ✅ Helper: log request to Node backend
def log_request(endpoint, method, response, user_agent="LocustLoadTester/1.0"):
    try:
        requests.post(BACKEND_LOG_URL, json={
            "endpoint": endpoint,
            "method": method,
            "response_time": response.elapsed.total_seconds() * 1000,  # ms
            "ip": MACHINE_IP,
            "user_agent": user_agent
        })
    except Exception as e:
        print("⚠️ Failed to send log:", e)


class ChatAppUser(HttpUser):
    wait_time = between(1, 3)
    host = "http://192.168.169.248:8000"

    def on_start(self):
        """Register and login a new user before tasks run"""
        self.identifier = f"locustuser{random.randint(1000,9999)}@test.com"
        self.password = "test123"
        self.user_id = None

        # Register
        resp = self.client.post("/api/auth/register", json={
            "name": "Locust Test",
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())
        log_request("/api/auth/register", "POST", resp)

        # Login
        login_resp = self.client.post("/api/auth/login", json={
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())
        log_request("/api/auth/login", "POST", login_resp)

        if login_resp.status_code == 200 and login_resp.json():
            self.user_id = login_resp.json().get("id")

    # ---------------- AUTH ----------------
    @task(1)
    def login_existing(self):
        resp = self.client.post("/api/auth/login", json={
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())
        log_request("/api/auth/login", "POST", resp)

    @task(1)
    def register_new(self):
        new_identifier = f"locustnew{random.randint(1000,9999)}@test.com"
        resp = self.client.post("/api/auth/register", json={
            "name": "Another Test",
            "identifier": new_identifier,
            "password": "test123"
        }, headers=trace_headers())
        log_request("/api/auth/register", "POST", resp)

    # ---------------- CONTACTS ----------------
    @task(1)
    def add_contact(self):
        if not self.user_id:
            return
        new_identifier = f"contact{random.randint(1000,9999)}@test.com"
        reg_resp = self.client.post("/api/auth/register", json={
            "name": "Contact User",
            "identifier": new_identifier,
            "password": "test123"
        }, headers=trace_headers())
        log_request("/api/auth/register", "POST", reg_resp)

        contact_id = None
        if reg_resp.status_code == 200 and reg_resp.json():
            contact_id = reg_resp.json().get("id")

        if contact_id:
            resp = self.client.post("/add-contact", json={
                "owner": self.user_id,
                "contact": contact_id,
                "name": f"Friend-{random.randint(1,100)}"
            }, headers=trace_headers())
            log_request("/add-contact", "POST", resp)

    @task(1)
    def fetch_contacts(self):
        if self.user_id:
            resp = self.client.get(f"/contacts/{self.user_id}", headers=trace_headers())
            log_request("/contacts/{id}", "GET", resp)

    @task(1)
    def delete_contact(self):
        if self.user_id:
            resp = self.client.post("/delete-contact", json={
                "owner": self.user_id,
                "contact": self.user_id + 1
            }, headers=trace_headers())
            log_request("/delete-contact", "POST", resp)

    # ---------------- USERS & MESSAGES ----------------
    @task(1)
    def fetch_users(self):
        resp = self.client.get("/users", headers=trace_headers())
        log_request("/users", "GET", resp)

    @task(1)
    def fetch_messages(self):
        resp = self.client.get("/messages", headers=trace_headers())
        log_request("/messages", "GET", resp)

    @task(1)
    def delete_conversation(self):
        if self.user_id:
            resp = self.client.post("/delete-conversation", json={
                "user1": self.user_id,
                "user2": self.user_id + 1
            }, headers=trace_headers())
            log_request("/delete-conversation", "POST", resp)

    # ---------------- GROUPS ----------------
    @task(1)
    def create_group(self):
        if self.user_id:
            resp = self.client.post("/create-group", json={
                "name": f"Group-{random.randint(1,100)}",
                "admin": self.user_id
            }, headers=trace_headers())
            log_request("/create-group", "POST", resp)

    @task(1)
    def fetch_groups(self):
        if self.user_id:
            resp = self.client.get(f"/groups/{self.user_id}", headers=trace_headers())
            log_request("/groups/{id}", "GET", resp)

    @task(1)
    def add_group_member(self):
        if self.user_id:
            resp = self.client.post("/add-group-member", json={
                "groupId": 1,
                "member": self.user_id
            }, headers=trace_headers())
            log_request("/add-group-member", "POST", resp)

    @task(1)
    def fetch_group_members(self):
        resp = self.client.get("/group-members/1", headers=trace_headers())
        log_request("/group-members/1", "GET", resp)

    @task(1)
    def fetch_group_messages(self):
        resp = self.client.get("/group-messages/1", headers=trace_headers())
        log_request("/group-messages/1", "GET", resp)

    @task(1)
    def send_group_message(self):
        if self.user_id:
            resp = self.client.post("/group-messages", json={
                "groupId": 1,
                "from": self.user_id,
                "text": "Hello from Locust!",
                "attachment_url": None,
                "timestamp": "2025-09-01 12:00:00"
            }, headers=trace_headers())
            log_request("/group-messages", "POST", resp)

    @task(1)
    def fetch_group_info(self):
        resp = self.client.get("/group-info/1", headers=trace_headers())
        log_request("/group-info/1", "GET", resp)