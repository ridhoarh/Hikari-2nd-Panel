import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    // `h-screen` + `overflow-hidden`, BUKAN `min-h-screen`.
    //
    // Dulu di sini `min-h-screen`, dan AppShell juga pakai `min-h-screen`.
    // Dobel begini bikin tinggi halaman ikut memanjang terus tiap konten
    // nambah tinggi — padahal sidebar dan header-nya udah penuh layar — jadi
    // scrollbar-nya muncul walau sebenernya nggak ada yang perlu di-scroll.
    //
    // Sekarang tingginya dikunci ke layar, dan yang di-scroll cuma isi
    // `<main>` (lihat AppShell), persis kayak panel-panel lain.
    <div className="h-screen overflow-hidden bg-bg text-ink">
      <Outlet />
    </div>
  ),
})
