import { useEffect, useState } from 'react';
import { App, Button, Card, Col, DatePicker, Form, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, StarFilled } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api/client';
import type { Promotion } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useIsManager } from '../auth/useIsManager';
import { PageHeader } from '../components/PageHeader';
import { ImageUpload } from '../components/ImageUpload';
import { date, errMsg } from '../utils/format';

function periodStatus(p: Promotion) {
  const now = dayjs();
  if (!p.active) return <Tag>Ẩn</Tag>;
  if (p.startDate && dayjs(p.startDate).isAfter(now)) return <Tag color="blue">Sắp diễn ra</Tag>;
  if (p.endDate && dayjs(p.endDate).isBefore(now)) return <Tag color="default">Đã kết thúc</Tag>;
  return <Tag color="green">Đang diễn ra</Tag>;
}

export default function PromotionsPage() {
  const manager = useIsManager();
  const { message } = App.useApp();
  const { data, loading, reload, setData } = useRequest(() => api.get<Promotion[]>('/promotions'), []);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [open, setOpen] = useState(false);

  const patch = async (p: Promotion, body: Partial<Promotion>) => {
    try {
      const saved = await api.put<Promotion>(`/promotions/${p.id}`, body);
      setData((d) => d?.map((x) => (x.id === p.id ? saved : x)));
    } catch (e) {
      message.error(errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Chương trình ưu đãi" scoped
        subtitle="Bài viết / banner hiển thị trên Mini App. Đánh dấu nổi bật để hiện ở banner trang chủ."
        extra={
          manager ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Thêm chương trình
            </Button>
          ) : null
        }
      />
      <Card>
        <Table<Promotion>
          rowKey="id"
          loading={loading}
          dataSource={data}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Chương trình',
              render: (_, p) => (
                <Space align="start">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} width={88} height={56} style={{ objectFit: 'cover', borderRadius: 4 }} />
                  ) : (
                    <div style={{ width: 88, height: 56, background: '#f0f0f0', borderRadius: 4 }} />
                  )}
                  <div style={{ maxWidth: 380 }}>
                    <Typography.Text strong>{p.title}</Typography.Text>
                    {p.featured ? <StarFilled style={{ color: '#faad14', marginLeft: 6 }} title="Nổi bật" /> : null}
                    <div>
                      <Typography.Text type="secondary" ellipsis>
                        {p.summary}
                      </Typography.Text>
                    </div>
                  </div>
                </Space>
              ),
            },
            {
              title: 'Thời gian',
              render: (_, p) => (
                <span className="nowrap">
                  {p.startDate ? date(p.startDate) : '…'} → {p.endDate ? date(p.endDate) : '…'}
                </span>
              ),
            },
            { title: 'Tình trạng', render: (_, p) => periodStatus(p) },
            {
              title: 'Nổi bật',
              dataIndex: 'featured',
              render: (v: boolean, p) => <Switch size="small" checked={v} disabled={!manager} onChange={(c) => patch(p, { featured: c })} />,
            },
            {
              title: 'Hiển thị',
              dataIndex: 'active',
              render: (v: boolean, p) => <Switch size="small" checked={v} disabled={!manager} onChange={(c) => patch(p, { active: c })} />,
            },
            {
              title: '',
              width: 100,
              render: (_, p) =>
                manager ? (
                  <Space size={0}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      title="Sửa"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    />
                    <Popconfirm
                      title="Xoá chương trình này?"
                      okText="Xoá"
                      okButtonProps={{ danger: true }}
                      cancelText="Không"
                      onConfirm={async () => {
                        try {
                          await api.del(`/promotions/${p.id}`);
                          message.success('Đã xoá');
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
      <PromotionModal open={open} promotion={editing} onClose={() => setOpen(false)} onSaved={() => reload()} />
    </>
  );
}

interface PromotionForm {
  title: string;
  summary?: string;
  content?: string;
  imageUrl?: string | null;
  range?: [Dayjs | null, Dayjs | null] | null;
  featured: boolean;
  active: boolean;
}

function PromotionModal({ open, promotion, onClose, onSaved }: { open: boolean; promotion: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<PromotionForm>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      promotion
        ? {
            title: promotion.title,
            summary: promotion.summary ?? '',
            content: promotion.content ?? '',
            imageUrl: promotion.imageUrl,
            range: [promotion.startDate ? dayjs(promotion.startDate) : null, promotion.endDate ? dayjs(promotion.endDate) : null],
            featured: promotion.featured,
            active: promotion.active,
          }
        : { featured: false, active: true },
    );
  }, [open, promotion, form]);

  return (
    <Modal
      title={promotion ? 'Sửa chương trình ưu đãi' : 'Thêm chương trình ưu đãi'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      width={720}
      forceRender
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          const body = {
            title: v.title.trim(),
            summary: v.summary?.trim() || null,
            content: v.content?.trim() ? v.content : null,
            imageUrl: v.imageUrl || null,
            startDate: v.range?.[0] ? v.range[0].startOf('day').toISOString() : null,
            endDate: v.range?.[1] ? v.range[1].endOf('day').toISOString() : null,
            featured: v.featured,
            active: v.active,
          };
          setSaving(true);
          try {
            if (promotion) await api.put(`/promotions/${promotion.id}`, body);
            else await api.post('/promotions', body);
            message.success('Đã lưu chương trình');
            onSaved();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="summary" label="Tóm tắt" extra="Hiện dưới tiêu đề trong danh sách">
          <Input.TextArea rows={2} maxLength={500} showCount />
        </Form.Item>
        <Form.Item name="content" label="Nội dung chi tiết" extra="Xuống dòng sẽ được giữ nguyên khi hiển thị">
          <Input.TextArea rows={8} maxLength={20000} />
        </Form.Item>
        <Form.Item name="imageUrl" label="Ảnh banner" extra="Khuyến nghị tỉ lệ 16:9">
          <ImageUpload />
        </Form.Item>
        <Form.Item name="range" label="Thời gian diễn ra" extra="Để trống = không giới hạn">
          <DatePicker.RangePicker format="DD/MM/YYYY" allowEmpty={[true, true]} style={{ width: '100%' }} placeholder={['Từ ngày', 'Đến ngày']} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="featured" label="Nổi bật (banner trang chủ)" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="active" label="Hiển thị" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
