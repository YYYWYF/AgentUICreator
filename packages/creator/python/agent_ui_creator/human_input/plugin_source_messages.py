"""Creator human-input namespace: pluginSourceOwnership (en-US / zh-CN)."""
MESSAGES = {
    "en-US": {
        "question": "Let this project own the source of Plugin {plugin_id}?",
        "description": "The currently installed source will be saved in your project for you to maintain. Plugin settings stay unchanged.\n\nUpgrading the npm package will not overwrite or automatically update this local source. Ask Creator to help sync new features when needed.\n\nShared dependencies still come from npm. Check compatibility after upgrades or source syncs.",
        "approve": "Manage source in this project",
        "decline": "Keep the package reference",
    },
    "zh-CN": {
        "question": "是否将插件 {plugin_id} 的源码交给当前工程托管？",
        "description": "接管后，当前版本的源码会保存到你的工程中，由你维护。插件配置保持不变。\n\n升级 npm 包不会覆盖或自动更新这份源码；需要新功能时，可以让 Creator 协助同步。\n\n共享依赖仍通过 npm 提供，升级或同步后需要检查兼容性。",
        "approve": "同意，转为工程源码托管",
        "decline": "保留 npm 包引用",
    },
}
