from locust import HttpUser, task, between, events
import random
import datetime
import socket

def get_local_ip():
    # gets LAN IP instead of 127.0.0.1
    hostname = socket.gethostname()
    return socket.gethostbyname(hostname)

def trace_headers():
    return {
        "X-Trace-IP": get_local_ip(),
        "X-Trace-Timestamp": datetime.datetime.now().isoformat(),
        "User-Agent": "LocustLoadTester/1.0"
    }

class ChatAppUser(HttpUser):
    wait_time = between(1, 3)
    host = "http://localhost:8000"

    def on_start(self):
        """Register and login a new user before tasks run"""
        self.identifier = f"locustuser{random.randint(1000,9999)}@test.com"
        self.password = "test123"
        self.user_id = None

        # Register
        self.client.post("/api/auth/register", json={
            "name": "Locust Test",
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())

        # Login
        login_resp = self.client.post("/api/auth/login", json={
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())

        if login_resp.status_code == 200 and login_resp.json():
            self.user_id = login_resp.json().get("id")

    # ---------------- AUTH ----------------
    @task(1)
    def login_existing(self):
        self.client.post("/api/auth/login", json={
            "identifier": self.identifier,
            "password": self.password
        }, headers=trace_headers())

    @task(1)
    def register_new(self):
        new_identifier = f"locustnew{random.randint(1000,9999)}@test.com"
        self.client.post("/api/auth/register", json={
            "name": "Another Test",
            "identifier": new_identifier,
            "password": "test123"
        }, headers=trace_headers())

    # ---------------- CONTACTS ----------------
    @task(1)
    def add_contact(self):
        if not self.user_id:
            return
        # create another user
        new_identifier = f"contact{random.randint(1000,9999)}@test.com"
        reg_resp = self.client.post("/api/auth/register", json={
            "name": "Contact User",
            "identifier": new_identifier,
            "password": "test123"
        }, headers=trace_headers())
        contact_id = None
        if reg_resp.status_code == 200 and reg_resp.json():
            contact_id = reg_resp.json().get("id")

        if contact_id:
            self.client.post("/add-contact", json={
                "owner": self.user_id,
                "contact": contact_id,
                "name": f"Friend-{random.randint(1,100)}"
            }, headers=trace_headers())

    @task(1)
    def fetch_contacts(self):
        if self.user_id:
            self.client.get(f"/contacts/{self.user_id}", headers=trace_headers())

    @task(1)
    def delete_contact(self):
        if self.user_id:
            self.client.post("/delete-contact", json={
                "owner": self.user_id,
                "contact": self.user_id + 1     # dummy contact
            }, headers=trace_headers())

    # ---------------- USERS & MESSAGES ----------------
    @task(1)
    def fetch_users(self):
        self.client.get("/users", headers=trace_headers())

    @task(1)
    def fetch_messages(self):
        self.client.get("/messages", headers=trace_headers())

    @task(1)
    def delete_conversation(self):
        if self.user_id:
            self.client.post("/delete-conversation", json={
                "user1": self.user_id,
                "user2": self.user_id + 1
            }, headers=trace_headers())

    # ---------------- GROUPS ----------------
    @task(1)
    def create_group(self):
        if self.user_id:
            self.client.post("/create-group", json={
                "name": f"Group-{random.randint(1,100)}",
                "admin": self.user_id
            }, headers=trace_headers())

    @task(1)
    def fetch_groups(self):
        if self.user_id:
            self.client.get(f"/groups/{self.user_id}", headers=trace_headers())

    @task(1)
    def add_group_member(self):
        if self.user_id:
            self.client.post("/add-group-member", json={
                "groupId": 1,
                "member": self.user_id
            }, headers=trace_headers())

    @task(1)
    def fetch_group_members(self):
        self.client.get("/group-members/1", headers=trace_headers())

    @task(1)
    def fetch_group_messages(self):
        self.client.get("/group-messages/1", headers=trace_headers())

    @task(1)
    def send_group_message(self):
        if self.user_id:
            self.client.post("/group-messages", json={
                "groupId": 1,
                "from": self.user_id,
                "text": "Hello from Locust!",
                "attachment_url": None,
                "timestamp": "2025-09-01 12:00:00"
            }, headers=trace_headers())

    @task(1)
    def fetch_group_info(self):
        self.client.get("/group-info/1", headers=trace_headers())


# ---------------- LOCUST EVENT LOGGER ----------------
@events.request.add_listener
def log_request(request_type, name, response_time, response_length, response, **kwargs):
    trace_ip = response.request.headers.get("X-Trace-IP", "N/A")
    trace_ts = response.request.headers.get("X-Trace-Timestamp", "N/A")
    trace_agent = response.request.headers.get("User-Agent", "N/A")

    print(
        f"[TRACE] {request_type} {name} | "
        f"Status: {response.status_code} | "
        f"IP: {trace_ip} | Agent: {trace_agent} | Timestamp: {trace_ts}"
    )