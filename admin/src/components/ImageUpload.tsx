import { useState } from 'react';
import { App, Button, Image, Space, Upload } from 'antd';
import { DeleteOutlined, LoadingOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import { errMsg } from '../utils/format';

interface Props {
  value?: string | null;
  onChange?: (url: string | null) => void;
}

/** Ô tải ảnh dùng trong Form.Item – giá trị là URL ảnh từ /upload */
export function ImageUpload({ value, onChange }: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  return (
    <Space align="start" wrap>
      {value ? (
        <Image src={value} width={120} height={80} style={{ objectFit: 'cover', borderRadius: 6 }} />
      ) : null}
      <Space direction="vertical">
        <Upload
          accept="image/png,image/jpeg,image/webp,image/gif"
          showUploadList={false}
          beforeUpload={async (file) => {
            if (file.size > 5 * 1024 * 1024) {
              message.error('Ảnh tối đa 5MB');
              return Upload.LIST_IGNORE;
            }
            setLoading(true);
            try {
              const { url } = await api.upload(file);
              onChange?.(url);
            } catch (e) {
              message.error(errMsg(e));
            } finally {
              setLoading(false);
            }
            return false;
          }}
        >
          <Button icon={loading ? <LoadingOutlined /> : <UploadOutlined />} disabled={loading}>
            {value ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
        </Upload>
        {value ? (
          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => onChange?.(null)}>
            Xoá ảnh
          </Button>
        ) : null}
      </Space>
    </Space>
  );
}
