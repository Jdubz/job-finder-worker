#!/usr/bin/env python3
"""
Refactor generator.ts to use centralized response utilities.
This script handles all ERROR_CODES patterns and converts them to helper functions.
"""

import re

def refactor_generator():
    with open('src/generator.ts', 'r') as f:
        content = f.read()

    replacements_made = {
        'method_not_allowed': 0,
        'validation_errors': 0,
        'not_found_errors': 0,
        'internal_errors': 0,
        'firestore_errors': 0,
    }

    # Pattern 1: METHOD_NOT_ALLOWED (with prior logger.warning)
    pattern1 = r'''          // Unknown route
          const err = ERROR_CODES\.METHOD_NOT_ALLOWED
          logger\.warning\("Method not allowed", \{ method: req\.method, path, requestId \}\)
          res\.status\(err\.status\)\.json\(\{
            success: false,
            error: "METHOD_NOT_ALLOWED",
            errorCode: err\.code,
            message: err\.message,
            requestId,
          \}\)
          resolve\(\)'''

    replacement1 = '''          // Unknown route
          sendErrorResponse(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED", {
            logger,
            requestId,
            logContext: { method: req.method, path },
          })
          resolve()'''

    if re.search(pattern1, content):
        content = re.sub(pattern1, replacement1, content)
        replacements_made['method_not_allowed'] += 1

    # Pattern 2: VALIDATION_FAILED (simple cases)
    pattern2 = r'''    if \(!(\w+)\) \{
      const err = ERROR_CODES\.VALIDATION_FAILED
      res\.status\(err\.status\)\.json\(\{
        success: false,
        error: "VALIDATION_FAILED",
        errorCode: err\.code,
        message: "([^"]+)",
        requestId,
      \}\)
      return
    \}'''

    def replace_validation(match):
        var_name = match.group(1)
        message = match.group(2)
        replacements_made['validation_errors'] += 1
        return f'''    if (!{var_name}) {{
      sendValidationError(res, "{message}", {{ logger, requestId }})
      return
    }}'''

    content = re.sub(pattern2, replace_validation, content)

    # Pattern 3: NOT_FOUND errors (simple cases)
    pattern3 = r'''    if \(!(\w+)\) \{
      const err = ERROR_CODES\.NOT_FOUND
      res\.status\(err\.status\)\.json\(\{
        success: false,
        error: "NOT_FOUND",
        errorCode: err\.code,
        message: "([^"]+)",
        requestId,
      \}\)
      return
    \}'''

    def replace_not_found(match):
        var_name = match.group(1)
        message = match.group(2)
        replacements_made['not_found_errors'] += 1
        # Extract resource name from message (e.g., "Generation request not found" -> "Generation request")
        resource = message.replace(" not found", "")
        return f'''    if (!{var_name}) {{
      sendNotFoundError(res, "{resource}", {{ logger, requestId }})
      return
    }}'''

    content = re.sub(pattern3, replace_not_found, content)

    # Pattern 4: INTERNAL_ERROR in catch blocks (with custom message from error)
    pattern4 = r'''  \} catch \(error\) \{
    logger\.error\("([^"]+)", \{ error, requestId(?:, [^}]+)? \}\)

    const err = ERROR_CODES\.INTERNAL_ERROR
    res\.status\(err\.status\)\.json\(\{
      success: false,
      error: "INTERNAL_ERROR",
      errorCode: err\.code,
      message: error instanceof Error \? error\.message : "([^"]+)",
      requestId,
    \}\)
  \}'''

    def replace_internal_error(match):
        log_message = match.group(1)
        fallback_message = match.group(2)
        replacements_made['internal_errors'] += 1
        return f'''  }} catch (error) {{
    sendInternalError(res, error instanceof Error ? error.message : "{fallback_message}", error instanceof Error ? error : undefined, {{
      logger,
      requestId,
    }})
  }}'''

    content = re.sub(pattern4, replace_internal_error, content)

    # Pattern 5: FIRESTORE_ERROR in catch blocks
    pattern5 = r'''  \} catch \(error\) \{
    logger\.error\("([^"]+)", \{ error, requestId(?:, [^}]+)? \}\)

    const err = ERROR_CODES\.FIRESTORE_ERROR
    res\.status\(err\.status\)\.json\(\{
      success: false,
      error: "FIRESTORE_ERROR",
      errorCode: err\.code,
      message: err\.message,
      requestId,
    \}\)
  \}'''

    def replace_firestore_error(match):
        log_message = match.group(1)
        replacements_made['firestore_errors'] += 1
        return '''  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }'''

    content = re.sub(pattern5, replace_firestore_error, content)

    # Pattern 6: INTERNAL_ERROR in catch blocks (without custom message)
    pattern6 = r'''  \} catch \(error\) \{
    logger\.error\("([^"]+)", \{ error, requestId \}\)

    const err = ERROR_CODES\.INTERNAL_ERROR
    res\.status\(err\.status\)\.json\(\{
      success: false,
      error: "INTERNAL_ERROR",
      errorCode: err\.code,
      message: err\.message,
      requestId,
    \}\)
  \}'''

    def replace_internal_error_simple(match):
        log_message = match.group(1)
        replacements_made['internal_errors'] += 1
        return f'''  }} catch (error) {{
    sendInternalError(res, "{log_message}", error instanceof Error ? error : undefined, {{ logger, requestId }})
  }}'''

    content = re.sub(pattern6, replace_internal_error_simple, content)

    # Write the refactored content
    with open('src/generator.ts', 'w') as f:
        f.write(content)

    print("Generator.ts refactoring completed!")
    print(f"Replacements made:")
    print(f"  - METHOD_NOT_ALLOWED: {replacements_made['method_not_allowed']}")
    print(f"  - Validation errors: {replacements_made['validation_errors']}")
    print(f"  - Not found errors: {replacements_made['not_found_errors']}")
    print(f"  - Internal errors: {replacements_made['internal_errors']}")
    print(f"  - Firestore errors: {replacements_made['firestore_errors']}")
    print(f"\nTotal: {sum(replacements_made.values())} patterns replaced")

if __name__ == '__main__':
    refactor_generator()
