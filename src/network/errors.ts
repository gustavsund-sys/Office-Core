export function connectionError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";
  if (/already in match/i.test(message))
    return "Du är redan ansluten i en annan flik. Lämna rummet där, eller använd en annan webbläsare.";
  if (/locked|not found|does not exist|invalid room/i.test(message))
    return "Rummet finns inte eller matchen har redan startat. Kontrollera rumskoden med värden.";
  if (/server full/i.test(message))
    return "Serverns två rum är upptagna. Anslut till ett befintligt rum eller lämna ett oanvänt rum.";
  return (
    message || "Kunde inte ansluta. Kontrollera anslutningen och försök igen."
  );
}
