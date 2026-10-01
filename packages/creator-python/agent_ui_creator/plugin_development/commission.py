from __future__ import annotations

import re


_QUOTED = re.compile(r"“[^”]*”|\"[^\"]*\"|‘[^’]*’")
_DIRECT_PLUGIN = re.compile(
    r"(?:开发|创建|新建|编写|实现|扩展|增强)\s*.{0,60}?(?:UI\s*)?(?:插件|Plugin)"
    r"|\b(?:develop|build|create|implement|extend)\s+.{0,90}?\bplugin\b",
    re.I,
)
_ADAPT_COMPONENT = re.compile(
    r"(?:把|将).{0,80}?(?:组件|component).{0,40}?(?:封装|包装|适配|改造).{0,30}?(?:插件|Plugin)"
    r"|\b(?:wrap|adapt|turn)\s+.{0,90}?\bcomponent\b.{0,60}?\bplugin\b",
    re.I,
)
_NON_COMMISSION_PREFIX = re.compile(
    r"(?:不要|不用|不需|无需|禁止|别|是否|是不是|要不要|需不需要|有必要|"
    r"可不可以|能不能|如果|没有|否则|才|分析|讨论|评估|考虑|解释|说明)\s*.{0,20}$"
    r"|\b(?:do\s+not|don't|whether|if|unless|only\s+analyze)\s+.{0,30}$",
    re.I,
)


def explicitly_commissions_plugin_development(message: str) -> bool:
    """Conservative grant guard; the Selector still decides the task route."""

    unquoted = _QUOTED.sub("", message)
    for pattern in (_DIRECT_PLUGIN, _ADAPT_COMPONENT):
        for match in pattern.finditer(unquoted):
            prefix = unquoted[max(0, match.start() - 32):match.start()]
            if not _NON_COMMISSION_PREFIX.search(prefix):
                return True
    return False
