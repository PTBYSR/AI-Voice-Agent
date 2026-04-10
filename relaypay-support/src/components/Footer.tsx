export default function Footer() {
  return (
    <footer className="py-8 text-center flex flex-col items-center gap-3">
      <img src="/logo.png" alt="RelayPay Logo" className="w-6 h-6 object-contain opacity-40 grayscale" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-rp-text-faint">
          &copy; 2025 RelayPay. All rights reserved.
        </p>
        <a
          href="/admin"
          className="text-xs text-rp-text-faint hover:text-rp-text-muted transition-colors"
        >
          Admin
        </a>
      </div>
    </footer>
  );
}
