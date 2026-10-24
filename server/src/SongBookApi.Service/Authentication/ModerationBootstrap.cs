using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using SongBookApi.Infrastructure.Identity;

namespace SongBookApi.Service.Authentication;

public static class ModerationBootstrap
{
    public const string EmailSetting = "Moderation:BootstrapSuperUserEmail";

    public static void ValidateConfiguration(IConfiguration configuration)
    {
        string? email = configuration[EmailSetting];
        if (!string.IsNullOrWhiteSpace(email) &&
            !new EmailAddressAttribute().IsValid(email.Trim()))
        {
            throw new InvalidOperationException(
                $"{EmailSetting} must be a valid email address.");
        }
    }

    public static async Task PromoteConfirmedUserAsync(
        IConfiguration configuration,
        UserManager<ApplicationUser> userManager)
    {
        string? email = configuration[EmailSetting]?.Trim();
        if (string.IsNullOrEmpty(email))
        {
            return;
        }

        ApplicationUser? user = await userManager.FindByEmailAsync(email);
        if (user is null || !user.EmailConfirmed || user.IsBanned ||
            await userManager.IsInRoleAsync(user, AuthConstants.SuperUserRole) ||
            (await userManager.GetUsersInRoleAsync(AuthConstants.SuperUserRole)).Count != 0)
        {
            return;
        }

        IdentityResult result = await userManager.AddToRoleAsync(
            user, AuthConstants.SuperUserRole);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "The confirmed bootstrap account could not be assigned the SuperUser role.");
        }

        result = await userManager.UpdateSecurityStampAsync(user);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "The bootstrap account's active sessions could not be invalidated.");
        }
    }
}
