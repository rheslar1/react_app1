FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/relay-api ./cmd/api

FROM alpine:3.21
RUN apk upgrade --no-cache && addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/relay-api /usr/local/bin/relay-api
USER 10001:10001
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/relay-api"]
