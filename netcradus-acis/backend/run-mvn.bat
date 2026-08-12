@echo off
setlocal
for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"

set "JAVA_HOME=C:\jdk21"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo JAVA_HOME not valid: %JAVA_HOME%
  exit /b 1
)

rem Repo-local Maven 3.9.9 (C:\acis-dev\apache-maven-3.9.6 is a broken/incomplete
rem install missing its lib JARs - do not point back at it).
set "M2_HOME=%SCRIPT_DIR%\..\apache-maven-3.9.9"
if not exist "%M2_HOME%\bin\mvn.cmd" (
  echo Maven not found at: %M2_HOME%
  exit /b 1
)

rem Resolve the classworlds boot jar by pattern instead of a hardcoded version
rem number - the exact plexus-classworlds version bundled differs per Maven
rem release (3.9.6 shipped 2.7.0, 3.9.9 ships 2.8.0).
set "CLASSWORLDS_JAR="
for %%J in ("%M2_HOME%\boot\plexus-classworlds-*.jar") do set "CLASSWORLDS_JAR=%%~fJ"
if not defined CLASSWORLDS_JAR (
  echo plexus-classworlds jar not found under: %M2_HOME%\boot
  exit /b 1
)

set "MAVEN_OPTS=-Xmx512m"
"%JAVA_HOME%\bin\java.exe" %MAVEN_OPTS% -classpath "%CLASSWORLDS_JAR%" "-Dclassworlds.conf=%M2_HOME%\bin\m2.conf" "-Dmaven.home=%M2_HOME%" "-Dmaven.multiModuleProjectDirectory=%SCRIPT_DIR%" org.codehaus.plexus.classworlds.launcher.Launcher %*
