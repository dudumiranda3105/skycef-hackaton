import json


def create_supplier(client):
    response = client.post("/api/cadastros/fornecedores", json={
        "code": "F001", "corporate_name": "Fornecedor Teste", "cnpj": "12345678000199",
    })
    assert response.status_code == 201
    return response.json()["id"]


def create_appointment(client, supplier_id, conditioning="PALETIZADO", hour="08:00:00"):
    data = {
        "supplier_id": supplier_id,
        "scheduled_date": "2026-10-05",
        "scheduled_time": hour,
        "conditioning": conditioning,
        "invoice_number": "12345",
        "invoice_key": "12345678901234567890123456789012345678901234",
        "weight_kg": 1250.5,
    }
    return client.post(
        "/api/agendamentos",
        data={"dados": json.dumps(data)},
        files={"nota_fiscal": ("nfe.xml", b"<NFe />", "application/xml")},
    )


def test_complete_task1_flow(client):
    supplier_id = create_supplier(client)
    response = create_appointment(client, supplier_id)
    assert response.status_code == 201, response.text
    appointment_id = response.json()["appointment"]["id"]

    response = client.post(f"/api/agendamentos/{appointment_id}/validacao-compras", json={
        "compliant": True, "purchase_order": "PC-001", "notes": "Conforme",
    })
    assert response.status_code == 200
    assert response.json()["appointment"]["status"] == "VALIDADO_COMPRAS"

    response = client.post(f"/api/agendamentos/{appointment_id}/autorizacao-armazem", json={
        "warehouse_ids": [1, 2],
    })
    assert response.status_code == 200
    assert len(response.json()["destinations"]) == 2

    assert client.post(f"/api/agendamentos/{appointment_id}/chegada", json={
        "occurred_at": "2026-10-05T07:55:00-03:00",
    }).status_code == 200
    assert client.post(f"/api/agendamentos/{appointment_id}/entrada", json={
        "occurred_at": "2026-10-05T08:02:00-03:00",
    }).status_code == 200
    response = client.post(f"/api/agendamentos/{appointment_id}/saida", json={
        "occurred_at": "2026-10-05T08:42:00-03:00",
        "worker_count": 2,
        "equipment_ids": [1],
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["appointment"]["status"] == "CONCLUIDO"
    assert body["unload"]["worker_count"] == 2
    assert len(body["events"]) == 6

    invoice = client.get(f"/api/agendamentos/{appointment_id}/nota-fiscal")
    assert invoice.status_code == 200
    assert invoice.content == b"<NFe />"


def test_loose_load_blocks_entire_slot(client):
    supplier_id = create_supplier(client)
    assert create_appointment(client, supplier_id, "BATIDO").status_code == 201
    second = create_appointment(client, supplier_id, "PALETIZADO")
    assert second.status_code == 409


def test_two_mechanized_loads_fit_but_third_does_not(client):
    supplier_id = create_supplier(client)
    assert create_appointment(client, supplier_id, "PALETIZADO").status_code == 201
    data = {
        "supplier_id": supplier_id, "scheduled_date": "2026-10-05",
        "scheduled_time": "08:00:00", "conditioning": "BIG_BAG",
    }
    second = client.post("/api/agendamentos", data={"dados": json.dumps(data)},
        files={"nota_fiscal": ("nfe2.xml", b"<NFe />", "application/xml")})
    assert second.status_code == 201
    data["invoice_number"] = "third"
    third = client.post("/api/agendamentos", data={"dados": json.dumps(data)},
        files={"nota_fiscal": ("nfe3.xml", b"<NFe />", "application/xml")})
    assert third.status_code == 409


def test_weekend_is_rejected(client):
    supplier_id = create_supplier(client)
    data = {
        "supplier_id": supplier_id, "scheduled_date": "2026-10-03",
        "scheduled_time": "08:00:00", "conditioning": "PALETIZADO",
    }
    response = client.post("/api/agendamentos", data={"dados": json.dumps(data)},
        files={"nota_fiscal": ("nfe.xml", b"<NFe />", "application/xml")})
    assert response.status_code == 422


def test_cannot_skip_purchase_validation(client):
    supplier_id = create_supplier(client)
    appointment_id = create_appointment(client, supplier_id).json()["appointment"]["id"]
    response = client.post(f"/api/agendamentos/{appointment_id}/autorizacao-armazem", json={
        "warehouse_ids": [1],
    })
    assert response.status_code == 422


def test_force_majeure_reschedule_can_ignore_capacity(client):
    supplier_id = create_supplier(client)
    first_id = create_appointment(client, supplier_id, "BATIDO").json()["appointment"]["id"]
    other = create_appointment(client, supplier_id, "PALETIZADO", hour="10:00:00")
    other_id = other.json()["appointment"]["id"]

    response = client.post(f"/api/agendamentos/{other_id}/reagendamento", json={
        "date": "2026-10-05", "time": "08:00:00",
        "force_majeure_reason": "Interdicao da rodovia",
    })

    assert response.status_code == 200, response.text
    assert response.json()["appointment"]["limit_ignored"] is True
    assert response.json()["appointment"]["scheduled_time"] == "08:00:00"
    assert first_id != other_id


def test_non_receipt_records_reason_and_closes_appointment(client):
    supplier_id = create_supplier(client)
    appointment_id = create_appointment(client, supplier_id).json()["appointment"]["id"]

    response = client.post("/api/nao-recebimentos", json={
        "appointment_id": appointment_id,
        "date": "2026-10-05",
        "reason": "SEM_AGENDAMENTO_SEM_VAGA",
        "description": "Entrega recusada pelo armazem",
    })

    assert response.status_code == 201, response.text
    assert response.json()["supplier_id"] == supplier_id
    detail = client.get(f"/api/agendamentos/{appointment_id}")
    assert detail.json()["appointment"]["status"] == "NAO_RECEBIDO"
