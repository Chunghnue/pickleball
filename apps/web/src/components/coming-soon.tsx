export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">
        Tính năng đang được phát triển, sẽ sớm ra mắt.
      </p>
    </main>
  );
}
