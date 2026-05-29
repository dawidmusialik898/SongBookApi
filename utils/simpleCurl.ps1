$baseUrl="https://localhost:7152"

# GET all songs
curl -X GET "$baseUrl/songs" -k

# POST - Create song
curl -X POST "$baseUrl/songs" `
  -H "Content-Type: application/json" `
  -d '{
    "title": "Amazing Grace",
    "author": "John Newton",
    "originalTitle": "Amazing Grace",
    "number": "1",
    "key": "G",
    "tempo": "Moderate",
    "parts": [],
    "order": []
  }' `
  -k

# GET specific song (replace ID)
curl -X GET "$baseUrl/songs/{id}" -k

# PUT - Update song
curl -X PUT "$baseUrl/songs/{id}" `
  -H "Content-Type: application/json" `
  -d '{
    "id": "{id}",
    "title": "Amazing Grace Updated",
    "author": "John Newton",
    "key": "A",
    "tempo": "Fast"
  }' -k

# DELETE song
curl -X DELETE "$baseUrl/songs/{id}" -k