FROM ghcr.io/shadowarcanist/aube:v2.2.0 AS build

WORKDIR /app

COPY package.json aube-lock.yaml aube-workspace.yaml ./

RUN aube ci

COPY . .

RUN aube run build

FROM ghcr.io/shadowarcanist/rustinx:v1.0

COPY --from=build /app/dist /static

COPY rustinx.toml /etc/rustinx/rustinx.toml

EXPOSE 9090
