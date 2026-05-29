using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Repositories;

namespace SongBookApi.Service.Extensions;

public static class ServicesExtensions
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        _ = services.AddScoped<ISongService, SongService>();
        _ = services.AddScoped<ISongRepository, InMemorySongRepository>();
        return services;
    }
}
