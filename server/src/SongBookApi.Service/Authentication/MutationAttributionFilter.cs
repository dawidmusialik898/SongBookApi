using SongBookApi.Domain.Services;
using SongBookApi.Service.Endpoints;

namespace SongBookApi.Service.Authentication;

public sealed class MutationAttributionFilter(IMutationContext mutation) : IEndpointFilter
{
    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        mutation.Current = new MutationContext(EndpointHelpers.GetUserId(context.HttpContext.User));
        return next(context);
    }
}