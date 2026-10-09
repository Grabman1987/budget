import { AppLink } from '../shell/app-link';

export function DebtLiquidityCheck() {
  return (
    <div className="debt-liquidity-check">
      <p className="vnote">
        Reicht das Geld für die Modellrate und Sondertilgung? Die Liquiditätsprognose zeigt
        Budget-Konten, wiederkehrende Zahlungen und geplante Ereignisse. Vergleiche dort den
        Tiefpunkt und Puffer mit der zusätzlichen Belastung. Diese Modellbeträge werden nicht
        übernommen; die Rechnung bestätigt weder die Finanzierbarkeit noch eine eingerichtete Rate.
      </p>
      <AppLink className="debt-liquidity-link" to="/reports/liquiditaet">
        Finanzierung in der Liquiditätsprognose prüfen
      </AppLink>
    </div>
  );
}
