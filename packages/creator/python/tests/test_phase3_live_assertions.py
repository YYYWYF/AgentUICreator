"""Acceptance checks must allow equivalent rest bindings and reject dropped props."""
import pytest
from live.test_phase3_creator_tasks import forwards_composer_props


@pytest.mark.parametrize('content,expected', [
    ('function X({rootProps, ...props}: P) { return <Composer {...props} rootProps={{...rootProps, style: {...rootProps?.style, borderRadius: "12px"}}} /> }', True),
    ('function X(props: P) { const {rootProps, ...rest} = props; return <Composer {...rest} rootProps={{...rootProps, style: {...rootProps?.style, borderRadius: "12px"}}} /> }', True),
    ('function X(props: P) { return <Composer {...props} rootProps={{...props.rootProps, style: {...props.rootProps?.style, borderRadius: "12px"}}} /> }', True),
    ('function X(props: P) { return <Composer {...props} rootProps={{style: {...props.rootProps?.style, borderRadius: "12px"}}} /> }', False),
    ('function X(props: P) { return <Composer {...props} rootProps={{...props.rootProps, style: {borderRadius: "12px"}}} /> }', False),
    ('function X(props: P) { const {rootProps, ...rest} = props; return <Composer rootProps={{...rootProps, style: {...rootProps?.style, borderRadius: "12px"}}} /> }', False),
    ('function X(props: P) { return <Composer {...props} rootProps={{style: {...rootProps?.style, borderRadius: "12px"}}} /> }', False),
    ('function X(props: P) { return <Composer {...props} rootProps={{...rootProps, style: {borderRadius: "12px"}}} /> }', False),
])
def test_composer_props_acceptance_follows_forwarding_not_variable_spelling(content,expected):
    assert forwards_composer_props(content) is expected
