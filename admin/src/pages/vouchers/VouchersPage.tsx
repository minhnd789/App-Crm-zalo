import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Card, Image, Input, Popconfirm, Segmented, Space, Switch, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, GiftOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import type { Paged, Voucher } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useIsManager } from '../../auth/useIsManager';
import { PageHeader } from '../../components/PageHeader';
import { BrandTag } from '../../components/BrandBadge';
import { useAuth } from '../../auth/AuthContext';
import type { ColumnsType } from 'antd/es/table';
import { TierTag } from '../../components/TierTag';
import { date, errMsg, num } from '../../utils/format';
import { discountText } from '../../utils/voucher';
import { GiftBulkModal, VoucherCheckModal, VoucherFormModal } from './VoucherModals';

export default function VouchersPage() {
  const manager = useIsManager();
  const { allBrands } = useAuth();
  const { message } = App.useApp();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | 'free' | 'points'>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [gift, setGift] = useState<Voucher | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  const { data, loading, reload, setData } = useRequest(
    () => api.get<Paged<Voucher>>('/vouchers', { q, type, page, pageSize }),
    [q, type, page, pageSize],
  );

  const toggleActive = async (v: Voucher, active: boolean) => {
    try {
      await api.put(`/vouchers/${v.id}`, { active });
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === v.id ? { ...x, active } : x)) } : d));
      message.success(active ? 'Đã bật voucher' : 'Đã tắt voucher');
    } catch (e) {
      message.error(errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Voucher" scoped
        subtitle="Mẫu voucher khách nhận miễn phí hoặc đổi bằng điểm trên Mini App"
        extra={
          <>
            <Button icon={<SafetyCertificateOutlined />} onClick={() => setCheckOpen(true)}>
              Kiểm tra mã voucher
            </Button>
            {manager ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Tạo voucher
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Tìm theo tên voucher"
            style={{ width: 260 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
          <Segmented
            value={type}
            onChange={(v) => {
              setType(v as '' | 'free' | 'points');
              setPage(1);
            }}
            options={[
              { label: 'Tất cả', value: '' },
              { label: 'Miễn phí', value: 'free' },
              { label: 'Đổi điểm', value: 'points' },
            ]}
          />
        </Space>
        <Table<Voucher>
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          scroll={{ x: allBrands ? 1260 : 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${num(t)} voucher`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
          columns={[
            ...(allBrands
              ? ([{ title: 'Thương hiệu', width: 160, render: (_, v) => <BrandTag brand={v.brand} brandId={v.brandId} /> }] as ColumnsType<Voucher>)
              : []),
            {
              title: 'Voucher',
              render: (_, v) => (
                <Space>
                  {v.imageUrl ? (
                    <Image src={v.imageUrl} width={56} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} preview={false} />
                  ) : null}
                  <div>
                    <Link to={`/vouchers/${v.id}`}>{v.title}</Link>
                    {v.minTier ? (
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Từ hạng{' '}
                        </Typography.Text>
                        <TierTag tier={v.minTier} />
                      </div>
                    ) : null}
                  </div>
                </Space>
              ),
            },
            {
              title: 'Loại',
              render: (_, v) => (v.pointCost > 0 ? <Tag color="orange">Đổi {num(v.pointCost)} điểm</Tag> : <Tag color="green">Miễn phí</Tag>),
            },
            { title: 'Ưu đãi', render: (_, v) => discountText(v) },
            {
              title: 'Đã phát',
              align: 'right',
              render: (_, v) => `${num(v.issuedCount)} / ${v.totalQuantity === null ? '∞' : num(v.totalQuantity)}`,
            },
            { title: 'Đã dùng', dataIndex: 'usedCount', align: 'right', render: (n) => num(n) },
            {
              title: 'Thời gian',
              render: (_, v) =>
                v.startDate || v.endDate ? (
                  <span className="nowrap">
                    {v.startDate ? date(v.startDate) : '…'} → {v.endDate ? date(v.endDate) : '…'}
                  </span>
                ) : (
                  'Không giới hạn'
                ),
            },
            {
              title: 'Hoạt động',
              dataIndex: 'active',
              render: (a: boolean, v) => <Switch checked={a} disabled={!manager} onChange={(c) => toggleActive(v, c)} size="small" />,
            },
            {
              title: '',
              width: 140,
              render: (_, v) =>
                manager ? (
                  <Space size={0}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      title="Sửa"
                      onClick={() => {
                        setEditing(v);
                        setFormOpen(true);
                      }}
                    />
                    <Button type="text" icon={<GiftOutlined />} title="Tặng hàng loạt" onClick={() => setGift(v)} />
                    <Popconfirm
                      title="Xoá voucher?"
                      description="Voucher đã phát cho khách sẽ chỉ bị ngừng hoạt động để giữ lịch sử."
                      okText="Xoá"
                      okButtonProps={{ danger: true }}
                      cancelText="Không"
                      onConfirm={async () => {
                        try {
                          const r = await api.del<{ deleted: boolean; deactivated?: boolean }>(`/vouchers/${v.id}`);
                          message.success(r.deleted ? 'Đã xoá voucher' : 'Voucher đã phát cho khách nên chỉ được ngừng hoạt động');
                          reload();
                        } catch (e) {
                          message.error(errMsg(e));
                        }
                      }}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} title="Xoá" />
                    </Popconfirm>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>
      <VoucherFormModal open={formOpen} voucher={editing} onClose={() => setFormOpen(false)} onSaved={() => reload()} />
      <GiftBulkModal voucher={gift} onClose={() => setGift(null)} onDone={() => reload()} />
      <VoucherCheckModal open={checkOpen} onClose={() => setCheckOpen(false)} onRedeemed={() => reload()} />
    </>
  );
}
