# Git Worktree Setup for Job Finder App Manager

## 🌳 **Worktree Structure**

The project uses git worktrees to allow each Claude worker to have their own working directory for each repository.

### **Directory Structure**

```
/home/jdubz/Development/job-finder-app-manager/
├── worktrees/                           # Worker worktrees (3 repos only)
│   ├── worker-a-job-finder/            # Worker A - Backend
│   ├── worker-a-job-finder-FE/          # Worker A - Frontend
│   ├── worker-a-job-finder-shared-types/ # Worker A - Shared Types
│   ├── worker-b-job-finder/             # Worker B - Backend
│   ├── worker-b-job-finder-FE/          # Worker B - Frontend
│   └── worker-b-job-finder-shared-types/ # Worker B - Shared Types
├── job-finder/                          # Main Backend Repo (PM works here on staging)
├── job-finder-FE/                       # Main Frontend Repo (PM works here on staging)
├── job-finder-shared-types/             # Main Shared Types Repo (PM works here on staging)
└── [PM works in main directory on main branch - documentation only]
```

## 👑 **PM (Project Manager) Setup**

The PM works differently for each repository:

```bash
# PM works in manager repo on main branch (documentation only)
cd /home/jdubz/Development/job-finder-app-manager
git checkout main

# PM works in development repos on staging branch (integration)
cd /home/jdubz/Development/job-finder
git checkout staging

cd /home/jdubz/Development/job-finder-FE
git checkout staging

cd /home/jdubz/Development/job-finder-shared-types
git checkout staging
```

## 🤖 **Worker A (Backend) Worktrees**

Worker A has dedicated worktrees for backend development:

```bash
# Backend development
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder

# Frontend development (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-FE

# Shared types (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-shared-types

# PM repo (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-a-job-finder-app-manager
```

## 🤖 **Worker B (Frontend) Worktrees**

Worker B has dedicated worktrees for frontend development:

```bash
# Frontend development
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-FE

# Backend development (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder

# Shared types (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-shared-types

# PM repo (when needed)
cd /home/jdubz/Development/job-finder-app-manager/worktrees/worker-b-job-finder-app-manager
```

## 📋 **Branch Structure**

Each worktree has its own branch:

### **Main Repositories (PM)**

- `main` - Production branch
- `staging` - Integration branch (PM works here)

### **Worker Branches**

- `worker-a-job-finder` - Worker A backend work
- `worker-a-job-finder-FE` - Worker A frontend work
- `worker-a-job-finder-shared-types` - Worker A shared types work
- `worker-a-job-finder-app-manager` - Worker A PM repo work
- `worker-b-job-finder` - Worker B backend work
- `worker-b-job-finder-FE` - Worker B frontend work
- `worker-b-job-finder-shared-types` - Worker B shared types work
- `worker-b-job-finder-app-manager` - Worker B PM repo work

## 🔄 **Workflow Process**

### **1. PM Assigns Tasks**

- PM creates issues in GitHub project board
- PM assigns tasks to appropriate workers
- PM provides context files and requirements

### **2. Workers Implement Features**

- Workers switch to their dedicated worktrees
- Workers create feature branches from their worker branches
- Workers implement features in isolation

### **3. Code Review Process**

- Workers submit PRs to staging branch
- PM reviews code quality and requirements
- PM merges approved PRs to staging

### **4. Integration Testing**

- PM tests integrated features on staging
- PM coordinates between workers for integration
- PM manages cross-repository dependencies

### **5. Production Deployment**

- PM merges staging to main
- PM coordinates production deployment
- PM manages release process

## 🛠️ **Worktree Management Commands**

### **List All Worktrees**

```bash
# In main directory
git worktree list

# In specific repository
cd job-finder && git worktree list
cd job-finder-FE && git worktree list
cd job-finder-shared-types && git worktree list
```

### **Add New Worktree**

```bash
# Add worktree for new worker
git worktree add ../worktrees/new-worker-job-finder -b new-worker-job-finder
```

### **Remove Worktree**

```bash
# Remove worktree
git worktree remove ../worktrees/worker-a-job-finder
```

### **Prune Worktrees**

```bash
# Clean up deleted worktrees
git worktree prune
```

## 📁 **Repository Access**

### **Worker A Primary Work**

- **Backend**: `/worktrees/worker-a-job-finder/`
- **Branch**: `worker-a-job-finder`

### **Worker B Primary Work**

- **Frontend**: `/worktrees/worker-b-job-finder-FE/`
- **Branch**: `worker-b-job-finder-FE`

### **PM Primary Work**

- **All Repos**: Main directories on `staging` branch
- **Coordination**: Main PM directory

## 🎯 **Benefits of This Setup**

1. **Isolation**: Each worker has their own working directory
2. **Parallel Development**: Workers can work simultaneously without conflicts
3. **Branch Management**: Each worker has dedicated branches
4. **Easy Switching**: Simple directory navigation for different tasks
5. **Clean History**: Separate commit histories for each worker
6. **Integration**: PM can easily coordinate and integrate changes

## 🚀 **Getting Started**

1. **PM**: Work in main directories on staging branch
2. **Worker A**: Switch to `/worktrees/worker-a-job-finder/` for backend work
3. **Worker B**: Switch to `/worktrees/worker-b-job-finder-FE/` for frontend work
4. **All Workers**: Use their dedicated worktrees for assigned tasks

This setup ensures efficient parallel development while maintaining clean separation of concerns and easy coordination through the PM.
