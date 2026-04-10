export default function Footer() {
  return (
    <footer className="py-8 text-center flex flex-col items-center gap-2">
      <p className="text-xs text-rp-text-faint">
        &copy; 2025 RelayPay. All rights reserved.
      </p>
      <a
        href="/admin"
        className="text-xs text-rp-text-faint hover:text-rp-text-muted transition-colors"
      >
        Admin
      </a>
    </footer>
  );
}
