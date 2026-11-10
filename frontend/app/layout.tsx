import type { Metadata } from "next";
import { ThemeInitializer } from "./appearance-settings";
import "./styles.css";
import "./theme.css";
import "./chart-ui.css";
import "./analytics.css";
import "./product.css";
import "./workspace-design.css";
import "tom-select/dist/css/tom-select.css";
import "./dropdowns.css";
import "./scrollbars.css";
import "./replay-island.css";
import "./appearance.css";
import "./drawing-tools.css";
import "./chart-splitter.css";
import "./active-charts.css";
import "./session-jump.css";
export const metadata: Metadata = {
  title: "eazy trading · NQ / ES",
  description:
    "Backtest NQ and ES. Choose a period, replay candles, and practice your entries.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="product-app"><ThemeInitializer />{children}</body>
    </html>
  );
}
