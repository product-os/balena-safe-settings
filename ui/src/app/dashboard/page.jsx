import TitleBar from "../components/TitleBar";

export default function DashboardPage() {
  return (
    <div>
      <TitleBar />
      <main className="container mt-4 main">
        <h2>Welcome to the Safe-Settings Hub Dashboard</h2>
        <p>Select a menu item above to get started.</p>
      </main>
    </div>
  );
}
