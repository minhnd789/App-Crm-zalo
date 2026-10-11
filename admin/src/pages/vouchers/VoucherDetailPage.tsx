import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Col, Descriptions, Image, Result, Row, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, EditOutlined, GiftOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import type { VoucherDetail } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useIsManager } from '../../auth/useIsManager';
import { StatusTag, VOUCHER_SOURCE } from '../../components/StatusTag';
import { TierTag } from '../../components/TierTag';
import { date, datetime, money, num } from '../../utils/format';
import { discountText } from '../../utils/voucher';
import { GiftBulkModal, VoucherFormModal } from './VoucherModals';

export default function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const manager = useIsManager();
  const { data: v, error, reload } = useRequest(() => api.get<VoucherDetail>(`/vouchers/${id}`), [id]);
  const [editOpen, setEditOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);

  if (error && !v) return <Result status="404" title={error} extra={<Link to="/vouchers">Về danh sách voucher</Link>} />;
  if (!v) return <Skeleton active paragraph={{ rows: 10 }} />;

  const used = v.stats.USED ?? 0;
  const available = v.stats.AVAILABLE ?? 0;
  const expired = v.stats.EXPIRED ?? 0;

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Quay lại
        </Button>
        {manager ? (
          <>
            <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
              Sửa
            </Button>
            <Button type="primary" icon={<GiftOutlined />} onClick={() => setGiftOpen(true)}>
              Tặng hàng loạt
            </Button>
          </>
        ) : null}
      </Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title={v.title}
            extra={v.active ? <Tag color="green">Đang hoạt động</Tag> : <Tag>Ngừng hoạt động</Tag>}
            cover={v.imageUrl ? <Image src={v.imageUrl} height={180} style={{ objectFit: 'cover' }} /> : undefined}
          >
            <Descriptions column={1} size="small" styles={{ label: { width: 150 } }}>
              <Descriptions.Item label="Ưu đãi">{discountText(v, false)}</Descriptions.Item>
              <Descriptions.Item label="Hoá đơn tối thiểu">{v.minOrder ? money(v.minOrder) : 'Không yêu cầu'}</Descriptions.Item>
              <Descriptions.Item label="Cách nhận">
                {v.pointCost > 0 ? <Tag color="orange">Đổi {num(v.pointCost)} điểm</Tag> : <Tag color="green">Miễn phí</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Hạng tối thiểu">{v.minTier ? <TierTag tier={v.minTier} /> : 'Tất cả'}</Descriptions.Item>
              <Descriptions.Item label="Số lượng">{v.totalQuantity === null ? 'Không giới hạn' : num(v.totalQuantity)}</Descriptions.Item>
              <Descriptions.Item label="Tối đa mỗi khách">{v.perCustomerLimit} lần</Descriptions.Item>
              <Descriptions.Item label="Hiệu lực">{v.validDays} ngày kể từ khi nhận</Descriptions.Item>
              <Descriptions.Item label="Thời gian phát">
                {v.startDate || v.endDate ? `${v.startDate ? date(v.startDate) : '…'} → ${v.endDate ? date(v.endDate) : '…'}` : 'Không giới hạn'}
              </Descriptions.Item>
            </Descriptions>
            {v.description ? (
              <Typography.Paragraph className="pre-line" style={{ marginTop: 12 }}>
                {v.description}
              </Typography.Paragraph>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Row gutter={[16, 16]}>
            <Col span={12} md={6}>
              <Card>
                <Statistic title="Đã phát" value={num(v.issuedCount)} />
              </Card>
            </Col>
            <Col span={12} md={6}>
              <Card>
                <Statistic title="Chưa dùng" value={num(available)} />
              </Card>
            </Col>
            <Col span={12} md={6}>
              <Card>
                <Statistic title="Đã dùng" value={num(used)} />
              </Card>
            </Col>
            <Col span={12} md={6}>
              <Card>
                <Statistic title="Hết hạn" value={num(expired)} />
              </Card>
            </Col>
            <Col span={24}>
              <Card title="Khách nhận gần đây">
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={v.recent}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Mã', dataIndex: 'code' },
                    {
                      title: 'Khách hàng',
                      render: (_, r) => (r.customer ? <Link to={`/customers/${r.customer.id}`}>{r.customer.name}</Link> : '—'),
                    },
                    { title: 'SĐT', render: (_, r) => r.customer?.phone ?? '—' },
                    { title: 'Nguồn', dataIndex: 'source', render: (s) => VOUCHER_SOURCE[s] ?? s },
                    { title: 'Nhận lúc', dataIndex: 'createdAt', render: datetime },
                    { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="voucher" status={s} /> },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
      <VoucherFormModal open={editOpen} voucher={v} onClose={() => setEditOpen(false)} onSaved={() => reload()} />
      <GiftBulkModal voucher={giftOpen ? v : null} onClose={() => setGiftOpen(false)} onDone={() => reload()} />
    </>
  );
}
