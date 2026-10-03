FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
COPY migrations ./migrations
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=build /app/target/recebimento-1.0.0.jar app.jar
USER 10001
EXPOSE 8000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
