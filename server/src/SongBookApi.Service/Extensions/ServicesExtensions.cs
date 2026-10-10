using SongBookApi.Domain.Repositories;
using SongBookApi.Domain.Services;
using SongBookApi.Infrastructure.Repositories;
using SongBookApi.Service.Authentication;
using SongBookApi.Service.Services;

namespace SongBookApi.Service.Extensions;

public static class ServicesExtensions
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        _ = services.AddScoped<ISongService, SongService>();
        _ = services.AddScoped<ISongRepository, EfSongRepository>();
        _ = services.AddScoped<ISongBookRepository, EfSongBookRepository>();
        _ = services.AddScoped<ISongBookService, SongBookService>();
        _ = services.AddScoped<ISongBookPdfRepository, EfSongBookPdfRepository>();
        _ = services.AddScoped<ISongBookPdfService, SongBookPdfService>();
        _ = services.AddScoped<ISongBookAccessService, SongBookAccessService>();
        return services;
    }
}
