# trunk github action

Github action that installs and runs a [`trunk`] command.

[`trunk`]: https://github.com/thedodd/trunk

## Inputs

### `args`

**Optional** Arguments to pass to `trunk`. Defaults to `build`.

### `version`

**Optional** The version of `trunk` to use. Must match a tagged release. Defaults to `latest`.

See: https://github.com/thedodd/trunk

## Example usage

```yaml
- uses: udoprog/trunk-action@v1
  with:
    version: latest
    args: build --release
```
