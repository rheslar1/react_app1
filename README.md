# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Deployment (Argo CD)

The `Deploy` workflow builds and pushes the image to Docker Hub, then commits
the image digest to `helm/react-app/values.yaml`. Argo CD watches that chart
(`argocd/application.yaml`) and syncs the cluster. The cluster is never
touched from CI.

One-time cluster setup:

```sh
# 1. Register the application with Argo CD
kubectl apply -f argocd/application.yaml

# 2. Pull secret for the private Docker Hub repository
kubectl create namespace react-app --dry-run=client -o yaml | kubectl apply -f -
kubectl -n react-app create secret docker-registry dockerhub-pull \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=<dockerhub-user> \
  --docker-password=<dockerhub-access-token>
```

Required repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
