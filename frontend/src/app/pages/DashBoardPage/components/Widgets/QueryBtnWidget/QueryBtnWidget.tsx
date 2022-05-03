/**
 * Datart
 *
 * Copyright 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Space } from 'antd';
import { WidgetContext } from 'app/pages/DashBoardPage/components/WidgetProvider/WidgetProvider';
import { memo, useContext } from 'react';
import { BoardContext } from '../../BoardProvider/BoardProvider';
import { FlexStyle, ZIndexStyle } from '../../WidgetComponents/constants';
import { EditMask } from '../../WidgetComponents/EditMask';
import { LockIconFn } from '../../WidgetComponents/StatusIcon';
import { StyledWidgetToolBar } from '../../WidgetComponents/StyledWidgetToolBar';
import { WidgetActionDropdown } from '../../WidgetComponents/WidgetActionDropdown';
import { WidgetWrapper } from '../../WidgetComponents/WidgetWrapper';
import { getWidgetBaseStyle } from '../../WidgetManager/utils';
import { QueryBtnWidgetCore } from './QueryBtnWidgetCore';

export const QueryBtnWidget: React.FC<{}> = memo(() => {
  const widget = useContext(WidgetContext) as any;

  const { editing } = useContext(BoardContext);

  // 自动更新
  const { background, border, padding } = getWidgetBaseStyle(
    widget.config.jsonConfig.props,
  );
  return (
    <WidgetWrapper background={background} border={border} padding={padding}>
      <div style={ZIndexStyle}>
        <div style={FlexStyle}>
          <QueryBtnWidgetCore />
        </div>
      </div>
      {editing && <EditMask />}
      <StyledWidgetToolBar>
        <Space size={0}>
          <LockIconFn
            boardEditing={editing}
            wid={widget.id}
            lock={widget.config?.lock}
          />
          <WidgetActionDropdown widget={widget} />
        </Space>
      </StyledWidgetToolBar>
    </WidgetWrapper>
  );
});
