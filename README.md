# Bare-Metal Multi-Node Kubernetes Microservices Platform

A production-grade demonstration of a containerized, two-tier microservices application orchestrated across a custom, bare-metal **3-node Kubernetes cluster (`kubeadm`)** hosted locally on Hyper-V virtual machines.



## 🏗️ Architecture Overview

The infrastructure bypasses managed cloud services (like AWS EKS or Google GKE) to simulate a real-world, enterprise on-premise data center environment:

* **Cluster Topology:** 1 Control Plane (Master Node), 2 Worker Nodes deployed via `kubeadm` on Ubuntu Server.
* **Application Tier:** Node.js Express API handling product catalog logic, utilizing Mongoose ODM.
* **Database Tier:** MongoDB 6.0 instance operating with high resilience via local node persistent storage.
* **Networking:** Private virtual switching inside Hyper-V, exposing endpoints to the host via a custom `NodePort` mapping.

---

## 🛠️ Tech Stack & Constraints

* **Orchestration:** Kubernetes (`kubeadm` v1.30+)
* **Container Runtime:** `containerd` with Systemd Cgroup integration
* **Network Plugin (CNI):** Flannel / Calico (optimized for low memory footprint)
* **Hardware Constraints:** Multi-node simulation using Hyper-V Dynamic RAM (2GB Base - 4GB Max per VM).
* **Database Customization:** Tailored with a strict `--wiredTigerCacheSizeGB: 0.25` runtime flag to remain stable under dynamic host memory ballooning.

---

## 📂 Repository Structure

```text
k8s-project/
├── backend/
│   ├── src/
│   │   └── server.js        # Express application logic & DB connection
│   ├── Dockerfile           # Multi-stage production Node.js build
│   └── package.json         # Dependencies (Express, Mongoose)
└── k8s/
    ├── mongodb.yaml         # SC, Local PV, PVC, Deployment, and ClusterIP Service
    └── backend.yaml         # Replicated API deployment and NodePort routing

---


## Deployment Steps
1. Host Directory Provisioning
Because this cluster utilizes local path persistent volumes for the database tier, the storage directory must be initialized manually with correct ownership on the targeted worker node (k8s-worker-node1):

Bash
sudo mkdir -p /mnt/data
sudo chmod -R 777 /mnt/data
2. Deploying the Infrastructure manifests
From the Master Node terminal, apply the Kubernetes manifests in sequence:

Bash
# Initialize storage and database tier
kubectl apply -f k8s/mongodb.yaml

# Initialize application replicas and external routing
kubectl apply -f k8s/backend.yaml
3. Verification
Verify the pods have transitioned to the Running state:

Bash
kubectl get pods -o wide
🧪 API Verification & Testing
The application is exposed via a high-range port (30080) across all cluster nodes. Run the following validation scripts from your host terminal:

Health Check Endpoint
Bash
curl http://<WORKER_NODE_IP>:30080/health
# Response: "Backend is operational"
Seeding Data (POST)
Bash
curl -X POST http://<WORKER_NODE_IP>:30080/api/products \
     -H "Content-Type: application/json" \
     -d '{"name": "Mechanical Keyboard", "price": 99}'
Fetching Data (GET)
Bash
curl http://<WORKER_NODE_IP>:30080/api/products

## 🧠 Core Engineering Challenges & Solutions

### 1. Hyper-V Dynamic RAM & MongoDB WiredTiger Panics (`exitCode:100`)
* **The Problem:** MongoDB's storage engine (`WiredTiger`) automatically allocates 50% of host RAM minus 1GB for cache. Because the Ubuntu VMs used Hyper-V Dynamic RAM, memory ballooning caused the underlying kernel memory allocation requests to fail silently during boot initialization, resulting in immediate pod crashes with an ambiguous `exitCode:100`.
* **The Engineering Solution:** Hardcoded explicit limits into the deployment manifest by invoking container runtime arguments: `args: ["--wiredTigerCacheSizeGB", "0.25"]`. This stabilizes memory consumption to a strict 256MB footprint, completely bypassing the dynamic ballooning trap.

### 2. Kubernetes Storage Object Immutability & Lifecycle Deadlocks
* **The Problem:** Upgrading the volume architecture from a legacy `HostPath` configuration to a structured local `StorageClass` threw severe validation errors from the API server because `PersistentVolumeSource` fields are immutable after creation. Deleting them created a finalizer deadlock, trapping the PVC in a permanent `Terminating` state.
* **The Engineering Solution:** Executed a patch configuration directly against the cluster metadata schema to strip out object finalizers (`kubectl patch pvc mongo-pvc -p '{"metadata":{"finalizers":null}}' --type=merge`). This safely forced the removal of the deadlocked components and permitted a clean redeployment.

### 3. Local Volume Affinity Constraints
* **The Problem:** Distributed databases running on bare-metal will lose data tracking if they shift between host worker machines randomly upon node failure.
* **The Engineering Solution:** Enforced strict `nodeAffinity` rules matching the exact hostname of the designated storage node (`k8s-worker-node1`) alongside a `volumeBindingMode: WaitForFirstConsumer` configuration. This forces the Kubernetes scheduler to intelligently keep the data container bound strictly to the node where the physical `/mnt/data` disk mount resides.
