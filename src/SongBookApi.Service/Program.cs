using SongBookApi.Service;
using SongBookApi.Service.Endpoints;
using SongBookApi.Service.Extensions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddApplicationServices();

builder.Services.AddCors(options =>
{
    options.AddPolicy(ServiceConstants.SongBookClientPolicyName, policy =>
    {
        policy.WithOrigins(
            "http://localhost:3000",
            "http://127.0.0.1:3000")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});
WebApplication app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    _ = app.MapOpenApi();
    app.UseCors(ServiceConstants.SongBookClientPolicyName);
}

app.UseHttpsRedirection();
app.MapSongEndpoints();



app.Run();