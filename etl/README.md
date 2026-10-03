# Carga de dados

O importador foi incorporado ao backend Java em `api/src/main/java/com/skycef/recebimento/dados`. Ele lê o ZIP original somente de um caminho local, importa os chapas e o histórico para PostgreSQL e marca a origem como `HISTORICO`. Os arquivos da Cocapec não são versionados.

```bash
cd api
mvn package
java -jar target/recebimento-1.0.0.jar --dados=C:/caminho/DADOS_HACKATHON_2026.zip
```

A operação substitui as tabelas históricas numa transação, sem alterar os registros da plataforma. Para os dados de demonstração `TESTE`, use `--demo-seed` em uma execução separada. Consulte o [README principal](../README.md).
