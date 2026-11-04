const MESSAGE = 'Browser storage is unavailable. Changes will last for this session only.';

export function StorageWarning({
  className,
  as: Tag = 'div',
}: {
  className: string;
  as?: 'div' | 'p';
}) {
  return (
    <Tag role="status" className={className}>
      {MESSAGE}
    </Tag>
  );
}
