import "./globals.css";
import TopNav from "./components/TopNav";

export const metadata = {
  title: "All-in-One PDF Toolkit",
  description: "Client-side PDF toolkit built with Next.js"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
