/** Read the text receipt without serializing media parts into application JSON. */
export function toolMessageText(content) {
    return typeof content === "string" ? content : content.flatMap(part => part.type === "text" ? [part.text] : []).join("");
}
//# sourceMappingURL=tool-message.js.map