@echo off
set "JAVA_HOME=C:\jdk21"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo JAVA_HOME not valid: %JAVA_HOME%
  exit /b 1
)
set "M2_HOME=C:\acis-dev\apache-maven-3.9.6"
set "MAVEN_OPTS=-Xmx512m"
"%JAVA_HOME%\bin\java.exe" %MAVEN_OPTS% -classpath "%M2_HOME%\boot\plexus-classworlds-2.7.0.jar" "-Dclassworlds.conf=%M2_HOME%\bin\m2.conf" "-Dmaven.home=%M2_HOME%" "-Dmaven.multiModuleProjectDirectory=C:\acis-dev\backend" org.codehaus.plexus.classworlds.launcher.Launcher %*
