export default function Header() {
  return (
    <header className="pt-8 pb-0">
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="RelayPay Logo" className="w-8 h-8 object-contain" />
        <div className="text-rp-primary font-semibold text-xl tracking-tight">
          RelayPay
        </div>
      </div>
      <hr className="mt-4 border-rp-border" />
    </header>
  );
}
