# Estágio 1: Build do frontend React (web/)
FROM node:24-alpine AS front-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Estágio 2: Build da API Java / Spring Boot com os artefatos estáticos em static/ui
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app
COPY api/pom.xml ./
COPY api/migrations ./migrations
COPY api/src ./src
COPY --from=front-build /app/api/src/main/resources/static/ui ./src/main/resources/static/ui
RUN mvn -B -DskipTests package

# Estágio 3: Imagem final de execução
FROM eclipse-temurin:21-jre
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=backend-build /app/target/recebimento-1.0.0.jar app.jar
USER 10001
EXPOSE 8000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

