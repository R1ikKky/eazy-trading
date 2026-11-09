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
export const metadata: Metadata = {
  title: "Replay Lab · NQ / ES",
  description:
    "Ручной бэктест NQ и ES. Выберите период, прокручивайте свечи и проверяйте свои входы.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <body className="product-app"><ThemeInitializer />{children}</body>
    </html>
  );
}
